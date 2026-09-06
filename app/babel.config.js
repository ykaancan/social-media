module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated/plugin must be listed last.
    // In Reanimated 4 this path is a shim that re-exports react-native-worklets/plugin.
    plugins: ['react-native-reanimated/plugin'],
  };
};
