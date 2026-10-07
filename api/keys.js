import { createCredentialHandler } from '../lib/conclave/credentials.js';
import { getDatabase } from '../lib/database.js';

export default createCredentialHandler({ database: () => getDatabase().db });
