const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

// Only local build scripts opt in; normal development/cloud builds keep defaults.
if (process.env.LOCAL_BUILD_METRO_WORKERS) {
  const workers = Number(process.env.LOCAL_BUILD_METRO_WORKERS);
  if (!Number.isInteger(workers) || workers < 1)
    throw new Error('LOCAL_BUILD_METRO_WORKERS must be a positive integer');
  config.maxWorkers = workers;
}

module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
});
