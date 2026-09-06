// CSS-first theme bridge
// D3 reads only the values needed for dynamic encoding (ex. choropleth colormap)
// categorical colors are decided by CSS

function readCssToken(styles, token) {
  const value = styles.getPropertyValue(token).trim();

  if (!value) {
    throw new Error(`Missing required Cold War CSS theme token: ${token}`);
  }

  return value;
}

export function getColdWarTheme() {
  const styles = getComputedStyle(document.documentElement);

  return Object.freeze({
    colors: Object.freeze({
      usa: readCssToken(styles, "--cw-color-usa"),
      ussr: readCssToken(styles, "--cw-color-ussr"),
      draw: readCssToken(styles, "--cw-color-draw"),
      neutral: readCssToken(styles, "--cw-color-neutral"),
      selected: readCssToken(styles, "--cw-color-selected"),
      boycott: readCssToken(styles, "--cw-color-boycott"),
      noMedal: readCssToken(styles, "--cw-color-no-medal"),
      nonParticipant: readCssToken(styles, "--cw-color-non-participant"),
      gold: readCssToken(styles, "--cw-color-gold"),
      silver: readCssToken(styles, "--cw-color-silver"),
      bronze: readCssToken(styles, "--cw-color-bronze"),
      totalLight: readCssToken(styles, "--cw-color-total-light"),
      totalDark: readCssToken(styles, "--cw-color-total-dark"),
      goldLight: readCssToken(styles, "--cw-color-gold-light"),
      goldDark: readCssToken(styles, "--cw-color-gold-dark")
    })
  });
}

export const CW_THEME = getColdWarTheme();
