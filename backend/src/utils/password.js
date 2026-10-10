const bcrypt = require('bcryptjs');
const { z } = require('zod');
const passwordRule = z.string().min(10, 'Use at least 10 characters').max(72, 'Use at most 72 characters')
  .regex(/[a-z]/, 'Add a lowercase letter').regex(/[A-Z]/, 'Add an uppercase letter')
  .regex(/\d/, 'Add a digit').regex(/[^A-Za-z0-9]/, 'Add a symbol');
const hash = (pw) => bcrypt.hash(pw, 12);
module.exports = { passwordRule, hash, compare: bcrypt.compare, DUMMY: bcrypt.hashSync('timing-equalizer', 12) };
