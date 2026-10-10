const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

// A company vehicle. driverId is its default driver (optional); a fuel funding can still name a different active driver.
const Vehicle = sequelize.define('Vehicle', {
  id, code: str(20, { allowNull: false, unique: true }), plateNo: str(20, { allowNull: false }),
  make: str(60, { allowNull: false }), model: str(60), year: D.SMALLINT,
  vehicleType: str(12, { allowNull: false, defaultValue: 'TRUCK' }), fuelType: str(10, { allowNull: false, defaultValue: 'DIESEL' }),
  tankCapacityLitres: D.DECIMAL(8, 2), driverId: D.UUID, notes: str(255),
  isActive: { type: D.BOOLEAN, allowNull: false, defaultValue: true }, createdBy: { type: D.UUID, allowNull: false },
}, { tableName: 'vehicles' });
module.exports = Vehicle;
