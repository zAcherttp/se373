import { staticLinked } from '../tsdown.client.ts'

export default staticLinked(
  '@se373/client-web',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)
