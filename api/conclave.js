import { createHostedHandler } from '../lib/conclave/hosted.js';
import { getDatabase } from '../lib/database.js';

export default createHostedHandler({ database: () => getDatabase().db });
