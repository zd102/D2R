import './mode.css';
import { enterLocalOrigin } from './local-entry';

if (await enterLocalOrigin()) await import('./main');
