import {encodeQR} from './encoder.js';
import {encodeMicroQR} from './micro-qr.js';
import {encodeRMQR} from './rmqr.js';
import {fail} from './errors.js';
/** Convenience facade. Choose 'standard' (default), 'micro', or 'rmqr'. */
export function generateQR(input, {kind='standard',...options}={}) {
  switch(kind){
    case 'standard': return encodeQR(input,options);
    case 'micro': return encodeMicroQR(input,options);
    case 'rmqr': return encodeRMQR(input,options);
    default: fail('INVALID_OPTION',"QR kind must be standard, micro, or rmqr");
  }
}
