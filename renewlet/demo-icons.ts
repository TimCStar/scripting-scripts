// Bundled illustrative icons for the fictional demo; never replace real account logos.
const shapes = [
  '<path fill="#3696ED" d="M17 37h29a9 9 0 0 0 0-18 14 14 0 0 0-27-2 10 10 0 0 0-2 20z"/>',
  '<rect x="6" y="14" width="52" height="36" rx="11" fill="#F43B42"/><path fill="white" d="m27 23 15 9-15 9z"/>',
  '<rect x="12" y="10" width="40" height="44" rx="5" fill="white" stroke="#20243B" stroke-width="3"/><path d="M22 44V20l20 24V20" fill="none" stroke="#20243B" stroke-width="5"/>',
  '<path fill="#F66B50" d="M23 7h9v18h-9a9 9 0 0 1 0-18"/><path fill="#F99B83" d="M32 7h9a9 9 0 0 1 0 18h-9"/><path fill="#A67FF3" d="M23 25h9v18h-9a9 9 0 0 1 0-18"/><circle cx="41" cy="34" r="9" fill="#55B9EE"/><path fill="#62CBB0" d="M23 43h9v9a9 9 0 1 1-9-9"/>',
  '<circle cx="32" cy="32" r="23" fill="none" stroke="#5268DA" stroke-width="4"/><ellipse cx="32" cy="32" rx="10" ry="23" fill="none" stroke="#5268DA" stroke-width="3"/><path d="M10 25h44M10 39h44" stroke="#5268DA" stroke-width="3"/>',
  '<rect x="6" y="6" width="52" height="52" rx="14" fill="#28AB88"/><path d="M39 18v26M25 24v25M25 24l14-6" stroke="white" stroke-width="4"/><ellipse cx="20" cy="49" rx="7" ry="5" fill="white"/><ellipse cx="34" cy="44" rx="7" ry="5" fill="white"/>',
]
export function demoIcon(id: string): string | null {
  const i = Number(id.replace(/^demo-/, ''))
  return /^demo-\d$/.test(id) && shapes[i]
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${shapes[i]}</svg>`
    : null
}
