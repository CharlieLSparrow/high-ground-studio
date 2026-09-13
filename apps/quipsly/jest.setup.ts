import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;
process.env.DATABASE_URL = "postgresql://mock";

// jsdom does not implement the browser top layer. Model open/close for component
// tests; focus trapping, Escape and backdrop behavior are exercised in-browser.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
}
