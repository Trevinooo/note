const THEME_KEY = 'quicknote_theme'

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

export function setTheme(mode) {
  const dark = mode === 'dark'
  if (dark) document.documentElement.setAttribute('data-theme', 'dark')
  else document.documentElement.removeAttribute('data-theme')
  try {
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
  } catch (_) { /* ignore */ }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#161b22' : '#6C63FF')
}

export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark')
}

export function initTheme() {
  let mode = 'light'
  try {
    if (localStorage.getItem(THEME_KEY) === 'dark') mode = 'dark'
  } catch (_) { /* ignore */ }
  setTheme(mode)
}
