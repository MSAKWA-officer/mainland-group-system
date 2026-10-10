import { api } from './client';

// Read-only, company-wide (needs fuel_reports.read).
// params: { from?, to?, vehicleId? } -> { totals: { fills, litres, amount }, rows: [{ id, code, plateNo, fuelType, fills, litres, amount, avgPricePerLitre, distanceKm, kmPerLitre, litresPer100Km, costPerKm }] }
export const consumption = (params) => api.get('/fuel-reports/consumption', { params }).then((r) => r.data);
// params: { from?, to?, groupBy (vehicle|driver) } -> { totals: { fundings, funded, used, balance, usedPercent }, rows: [{ id, label, fundings, openFundings, funded, used, balance, usedPercent, fundedLitres, usedLitres }] }
export const reconciliation = (params) => api.get('/fuel-reports/reconciliation', { params }).then((r) => r.data);
// params: { year?, vehicleId?, driverId? } -> { year, totals, rows: [{ month, period, funded, fills, litres, used, avgPricePerLitre }] }
export const monthly = (params) => api.get('/fuel-reports/monthly', { params }).then((r) => r.data);
