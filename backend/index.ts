// Deploy these three files together as an Edge Function after owner setup.
import {createSheetsProxy} from './sheets-proxy.js';
Deno.serve(createSheetsProxy(Deno.env.toObject()));
