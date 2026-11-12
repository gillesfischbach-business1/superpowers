/** CLI: run the agent pipeline without the web server. */
import { Pipeline } from '../server/pipeline.js';
import { buildWorld } from '../public/js/core/world.js';

const scope = process.argv[2] || 'all';
const world = buildWorld({ seed: Number(process.env.WORLD_SEED || 20261112) });
const pipeline = new Pipeline({ root: process.cwd(), world });
pipeline.broadcast = () => {};
pipeline.log = (text, agent, kind) => console.log(agent ? `[${agent}] ${text}` : text);

const result = await pipeline.run(scope);
process.exit(result && result.ok === false ? 1 : 0);
