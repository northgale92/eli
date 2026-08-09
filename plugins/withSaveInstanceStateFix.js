const { withMainActivity } = require('@expo/config-plugins');

// React Native gestiona su propio estado en JS (MainActivity.onCreate ya
// invoca super.onCreate(null), descartando cualquier savedInstanceState al
// restaurar). En Samsung/One UI hemos visto crashear la app con
// TransactionTooLargeException al pasar a segundo plano: el Bundle que
// Android intenta persistir vía Binder IPC (onSaveInstanceState ->
// activityStopped) supera el límite (~1MB) cuando se acumulan registros de
// ActivityResultLauncher (expo-image-picker, expo-document-picker,
// expo-speech-recognition) y estado de fragmentos a lo largo de la sesión.
//
// Como nunca restauramos ese estado, es seguro no guardarlo: se sobreescribe
// onSaveInstanceState para persistir un Bundle vacío en su lugar.
function withSaveInstanceStateFix(config) {
  return withMainActivity(config, (config) => {
    const { modResults } = config;
    const { language } = modResults;

    if (modResults.contents.includes('onSaveInstanceState')) {
      return config;
    }

    if (language === 'kt' || language === 'java') {
      const overrideKt = `
  // @generated begin withSaveInstanceStateFix
  // Evita TransactionTooLargeException: RN no restaura savedInstanceState
  // (ver onCreate, que pasa null a super), así que es seguro no persistirlo.
  override fun onSaveInstanceState(outState: Bundle) {
    super.onSaveInstanceState(Bundle())
  }
  // @generated end withSaveInstanceStateFix
`;
      const overrideJava = `
  // @generated begin withSaveInstanceStateFix
  // Evita TransactionTooLargeException: RN no restaura savedInstanceState
  // (ver onCreate, que pasa null a super), así que es seguro no persistirlo.
  @Override
  protected void onSaveInstanceState(Bundle outState) {
    super.onSaveInstanceState(new Bundle());
  }
  // @generated end withSaveInstanceStateFix
`;
      const override = language === 'kt' ? overrideKt : overrideJava;

      // Insertar justo antes de la última llave de cierre de la clase.
      const lastBraceIndex = modResults.contents.lastIndexOf('}');
      if (lastBraceIndex !== -1) {
        modResults.contents =
          modResults.contents.slice(0, lastBraceIndex) +
          override +
          modResults.contents.slice(lastBraceIndex);
      }
    }

    return config;
  });
}

module.exports = withSaveInstanceStateFix;
