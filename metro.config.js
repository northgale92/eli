const { getDefaultConfig } = require('expo/metro-config');
const exclusionList = require('metro-config/private/defaults/exclusionList').default;

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('tflite');

// Los binarios/headers C++ nativos de react-native-fast-tflite (y las
// carpetas .cxx de builds nativos de Android) no son JS y no necesitan
// vigilarse — el FallbackWatcher de Metro en Windows falla con ENOENT si
// intenta observar una de estas rutas justo cuando Gradle las está
// creando/moviendo (visto en la práctica: colgaba Metro al arrancar tras
// un build nativo reciente).
config.resolver.blockList = exclusionList([
  /node_modules\/react-native-fast-tflite\/android\/src\/main\/cpp\/lib\/.*/,
  /android\/\.cxx\/.*/,
  /android\/app\/build\/.*/,
]);

module.exports = config;
