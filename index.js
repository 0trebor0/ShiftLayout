const ShiftLayout = require('./src/ShiftLayout');
const writeResources = require('./src/resourceWriter');

ShiftLayout.writeResources = writeResources;

module.exports = ShiftLayout;
module.exports.writeResources = writeResources;
