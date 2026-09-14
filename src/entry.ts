import './mode.css';
import { enterLocalOrigin } from './local-entry';

const query = new URL(location.href).searchParams;
const localEntry = query.get('mode') === 'local' || ['recover-local', 'local-migration-task', 'migration-receive'].some(key => query.has(key));
if (!localEntry || await enterLocalOrigin()) await import('./main');
