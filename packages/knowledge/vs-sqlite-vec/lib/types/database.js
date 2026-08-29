/**
 * One generation, one SQLite file.
 *
 * That is the whole storage design, and it is what makes the settled
 * "build alongside, flip, then drop" mechanism cheap: a rebuild is a second
 * file, a flip is one line in a manifest, and a drop is `unlink`. Sharing one
 * database between generations would make every one of those a transaction
 * against data that is being read concurrently.
 *
 * `node:sqlite` rather than a native driver: the extension loads through
 * `DatabaseSync(..., { allowExtension: true })` and `sqlite-vec` ships prebuilt
 * platform binaries, so nothing here needs a compiler.
 *
 * @module @se373/vs-sqlite-vec/database
 */
import { DatabaseSync } from 'node:sqlite';
import { getLoadablePath } from 'sqlite-vec';
/** Meta keys carrying a writer label rather than a store fact. */
const LABEL_PREFIX = 'label:';
/** Float32 vector as the blob vec0 expects. */
function toBlob(vector) {
    return new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
}
/**
 * An open generation database.
 *
 * Deliberately not a Service: a generation's lifetime is shorter than a
 * plugin's and several are open at once during a rebuild, so ownership belongs
 * to the store that opened them.
 */
export class GenerationDatabase {
    id;
    db;
    constructor(db, id) {
        this.id = id;
        this.db = db;
    }
    /** Open a file and load the vector extension into it. */
    static connect(path) {
        const db = new DatabaseSync(path, { allowExtension: true });
        db.loadExtension(getLoadablePath());
        // WAL keeps a rebuild's writes from blocking reads of the same file, which
        // matters when a generation is re-activated after being written.
        db.exec('pragma journal_mode = wal');
        return db;
    }
    /**
     * Create a generation file and its schema.
     * @param path - where the file goes.
     * @param id - the generation id.
     * @param meta - identity binding, fixed for the file's life.
     * @returns the open database.
     */
    static create(path, id, meta) {
        const db = GenerationDatabase.connect(path);
        // `dims` is interpolated because a vec0 table declares its width in DDL and
        // SQLite does not bind parameters in DDL. It is an integer that came from a
        // registry row's `mrlDims`, checked below rather than trusted.
        if (!Number.isInteger(meta.dims) || meta.dims <= 0 || meta.dims > 65536) {
            throw new RangeError(`refusing to create a vec0 table with dims ${meta.dims}`);
        }
        db.exec(`
      create table meta (key text primary key, value text not null);
      create table records (
        id integer primary key autoincrement,
        key text not null unique,
        text text,
        metadata text
      );
      create virtual table vectors using vec0(embedding float[${meta.dims}]);
    `);
        const put = db.prepare('insert into meta(key, value) values (?, ?)');
        put.run('fingerprint', meta.fingerprint);
        put.run('dims', String(meta.dims));
        put.run('modelId', meta.modelId);
        put.run('status', meta.status);
        put.run('createdAt', String(meta.createdAt));
        // Labels share the meta table under a prefix rather than getting one of
        // their own: they are written once at creation and read whole, so a second
        // table would buy nothing but a second thing to migrate.
        for (const [key, value] of Object.entries(meta.labels))
            put.run(LABEL_PREFIX + key, value);
        return new GenerationDatabase(db, id);
    }
    /**
     * Open an existing generation file.
     * @param path - the file.
     * @param id - the generation id.
     * @returns the open database.
     */
    static open(path, id) {
        return new GenerationDatabase(GenerationDatabase.connect(path), id);
    }
    /** Read the whole meta table. */
    meta() {
        const rows = this.db.prepare('select key, value from meta').all();
        return Object.fromEntries(rows.map(row => [row.key, row.value]));
    }
    /** This generation, as the seam describes it. */
    describe() {
        const meta = this.meta();
        const count = this.db.prepare('select count(*) as n from records').get();
        const labels = {};
        for (const [key, value] of Object.entries(meta)) {
            if (key.startsWith(LABEL_PREFIX))
                labels[key.slice(LABEL_PREFIX.length)] = value;
        }
        return {
            id: this.id,
            fingerprint: meta['fingerprint'] ?? '',
            dims: Number(meta['dims'] ?? 0),
            modelId: meta['modelId'] ?? '',
            status: (meta['status'] ?? 'building'),
            createdAt: Number(meta['createdAt'] ?? 0),
            records: Number(count.n),
            labels,
        };
    }
    /**
     * Move this generation's lifecycle position.
     * @param status - the new status.
     */
    setStatus(status) {
        this.db.prepare('update meta set value = ? where key = ?').run(status, 'status');
    }
    /**
     * Insert or replace rows.
     *
     * Wrapped in one transaction because a partially written batch is a
     * generation whose `records` count and vector count disagree, and nothing
     * downstream would notice until a query returned a row with no vector.
     * @param records - chunk descriptors.
     * @param vectors - positionally paired vectors.
     */
    upsert(records, vectors) {
        const findRow = this.db.prepare('select id from records where key = ?');
        const insertRow = this.db.prepare('insert into records(key, text, metadata) values (?, ?, ?)');
        const updateRow = this.db.prepare('update records set text = ?, metadata = ? where id = ?');
        const dropVector = this.db.prepare('delete from vectors where rowid = ?');
        const addVector = this.db.prepare('insert into vectors(rowid, embedding) values (?, ?)');
        this.db.exec('begin');
        try {
            for (const [index, record] of records.entries()) {
                const text = record.text ?? null;
                const metadata = record.metadata === undefined ? null : JSON.stringify(record.metadata);
                const existing = findRow.get(record.key);
                let rowid;
                if (existing === undefined) {
                    rowid = Number(insertRow.run(record.key, text, metadata).lastInsertRowid);
                }
                else {
                    rowid = existing.id;
                    updateRow.run(text, metadata, rowid);
                    // vec0 has no upsert, so replacing a vector is delete-then-insert.
                    dropVector.run(BigInt(rowid));
                }
                addVector.run(BigInt(rowid), toBlob(vectors[index]));
            }
            this.db.exec('commit');
        }
        catch (error) {
            this.db.exec('rollback');
            throw error;
        }
    }
    /**
     * Nearest neighbours of one vector.
     * @param vector - the query vector.
     * @param k - how many hits.
     * @returns hits, nearest first.
     */
    query(vector, k) {
        // `k = ?` rather than `limit ?`: vec0 needs the neighbour count as a
        // constraint on its own scan, and a `limit` sitting outside a join is not
        // one -- it refuses the query rather than silently scanning everything,
        // which is the good failure but only if you write it this way.
        const rows = this.db.prepare(`
      select r.key as key, v.distance as distance, r.text as text, r.metadata as metadata
      from vectors v join records r on r.id = v.rowid
      where v.embedding match ? and k = ? order by v.distance
    `).all(toBlob(vector), k);
        return rows.map(row => ({
            key: row.key,
            distance: row.distance,
            text: row.text,
            metadata: row.metadata === null ? null : JSON.parse(row.metadata),
        }));
    }
    /**
     * Every stored record, without its vector, in insertion order.
     *
     * Paged rather than read whole: this is the chunk-cache read behind a
     * re-embed, so it runs over the entire index by definition, and the point of
     * streaming it is not to hold the corpus in memory while doing so.
     * @param batch - rows per page.
     */
    *records(batch = 500) {
        const page = this.db.prepare('select id, key, text, metadata from records where id > ? order by id limit ?');
        let after = 0;
        for (;;) {
            const rows = page.all(after, batch);
            if (rows.length === 0)
                return;
            for (const row of rows) {
                after = row.id;
                yield {
                    key: row.key,
                    ...row.text === null ? {} : { text: row.text },
                    ...row.metadata === null ? {} : { metadata: JSON.parse(row.metadata) },
                };
            }
        }
    }
    /**
     * Delete rows by key.
     * @param keys - record keys; unknown keys are ignored.
     * @returns how many rows were removed.
     */
    remove(keys) {
        const find = this.db.prepare('select id from records where key = ?');
        const dropRow = this.db.prepare('delete from records where id = ?');
        const dropVector = this.db.prepare('delete from vectors where rowid = ?');
        let removed = 0;
        this.db.exec('begin');
        try {
            for (const key of keys) {
                const row = find.get(key);
                if (row === undefined)
                    continue;
                // The vector first: a records row with no vector is invisible to every
                // query, but a vector with no records row is a hit that fails its join
                // and silently shrinks every result set it appears in.
                dropVector.run(BigInt(row.id));
                dropRow.run(row.id);
                removed += 1;
            }
            this.db.exec('commit');
        }
        catch (error) {
            this.db.exec('rollback');
            throw error;
        }
        return removed;
    }
    /** Close the handle. */
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=database.js.map