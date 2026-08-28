/**
 * The runtime graph, over the wire.
 *
 * `ctx.runtimeGraph` is a host service; the board is a browser view. This is
 * the one thing between them — a Remote namespace the generated typert
 * descriptor turns into an `/api` endpoint and a typed client method.
 *
 * It exists as its own package for the reason the tool did: the projection is
 * infrastructure, and exposing it over a network boundary is a **deployment
 * choice**. Invariant I3 says a deployment choice is a config row you can
 * disable, not an import you have to delete — and this one is a row a
 * hardened deployment might well turn off.
 *
 * Why the fence matters here specifically: a node carries its **resolved
 * config**. That is the payload's whole point at the board, and it is also the
 * reason this must not become a plain route on the webserver. `/api` is behind
 * the browser-trust fence; an unauthenticated route beside it would publish
 * every row's configuration to anything that could reach the port.
 *
 * @module @se373/board-gateway
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Remote, TypertRemoteService } from '@se373/typert-protocol';
/** Remote-only service exposing the runtime graph to browser surfaces. */
let BoardGateway = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _snapshot_decorators;
    return class BoardGateway extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _snapshot_decorators = [Remote('snapshot')];
            __esDecorate(this, null, _snapshot_decorators, { kind: "method", name: "snapshot", static: false, private: false, access: { has: obj => "snapshot" in obj, get: obj => obj.snapshot }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['runtimeGraph'];
        constructor(ctx) {
            super(ctx, 'board');
            __runInitializers(this, _instanceExtraInitializers);
        }
        /**
         * Project the whole tree.
         *
         * Unnarrowed on purpose. The narrowing `ctx.runtimeGraph.snapshot()` offers
         * exists so a *model* need not read 190 rows into its context; a board has
         * no such budget problem, and filtering in the browser keeps a filter change
         * from being a round trip.
         * @returns every configured row, disabled ones included.
         */
        snapshot() {
            const snapshot = this.ctx.runtimeGraph.snapshot();
            return {
                capturedAt: snapshot.capturedAt,
                totalNodes: snapshot.totalNodes,
                // Spread rather than pass through: the projection's arrays are readonly
                // and the wire shape is not, because the codec has to construct the far
                // side. The copy is shallow-by-field on purpose -- a structural mismatch
                // should be a type error here, not a silent cast.
                nodes: snapshot.nodes.map(node => ({
                    ...node,
                    provides: [...node.provides],
                    injects: [...node.injects],
                    unresolvedInjects: [...node.unresolvedInjects],
                    edges: node.edges.map(edge => ({ ...edge })),
                    transitions: node.transitions.map(transition => ({ ...transition })),
                })),
            };
        }
    };
})();
export { BoardGateway };
export default BoardGateway;
//# sourceMappingURL=index.js.map