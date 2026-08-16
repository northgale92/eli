const { withAndroidManifest } = require('@expo/config-plugins');

// app.json fija android.allowBackup=false a propósito (junto con las reglas
// de exclusión de expo-secure-store, secure_store_backup_rules /
// secure_store_data_extraction_rules): es una medida de privacidad
// deliberada para que el backup automático de Android no se lleve claves/
// datos de sesión cifrados fuera del dispositivo — no algo que deba ceder
// ante una dependencia de terceros.
//
// TAndroidLame (encoder MP3 usado por react-native-compressor para audio)
// trae su propio AndroidManifest.xml con android:allowBackup="true", lo que
// choca con el nuestro en el manifest merger:
//   "Attribute application@allowBackup value=(false) ... is also present at
//    [com.github.kaushik-naik:TAndroidLame] ... value=(true)"
// La solución recomendada por el propio merger es marcar el atributo con
// tools:replace para que gane explícitamente el valor de esta app.
function withAllowBackupFix(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) return config;

    const attrs = application.$ ?? (application.$ = {});
    const existentes = attrs['tools:replace'] ? attrs['tools:replace'].split(',').map((s) => s.trim()) : [];
    if (!existentes.includes('android:allowBackup')) {
      existentes.push('android:allowBackup');
      attrs['tools:replace'] = existentes.join(',');
    }

    return config;
  });
}

module.exports = withAllowBackupFix;
