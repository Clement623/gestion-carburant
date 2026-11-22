/**
 * Construction sûre du DOM.
 *
 * Toute l'interface est créée avec h() (éléments HTML) et svg() (graphiques).
 * Le texte passe TOUJOURS par des nœuds texte, jamais par innerHTML : une donnée saisie
 * (« <img onerror=…> » comme nom de station) s'affiche telle quelle et ne peut pas s'exécuter.
 * Garde-fous supplémentaires :
 * - les attributs « on… » sont refusés (les événements passent par { on: { click: fn } }) ;
 * - les URL (href, src) sont limitées aux liens internes et aux fichiers générés (blob:) ;
 * - les styles passent par l'API CSSOM, autorisée par la politique de sécurité (CSP).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const SAFE_URL = /^(#|\.\/|blob:)/;
const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster']);
const PROPERTIES = new Set(['value', 'checked', 'disabled', 'selected', 'hidden']);

function applyProps(element, props, isSvg) {
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    switch (key) {
      case 'class':
        element.setAttribute('class', Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value));
        break;
      case 'style':
        for (const [property, propertyValue] of Object.entries(value)) {
          if (propertyValue != null) element.style.setProperty(property, String(propertyValue));
        }
        break;
      case 'on':
        for (const [type, handler] of Object.entries(value)) element.addEventListener(type, handler);
        break;
      case 'dataset':
        for (const [name, dataValue] of Object.entries(value)) element.dataset[name] = String(dataValue);
        break;
      case 'ref':
        value(element);
        break;
      default:
        if (/^on/i.test(key)) throw new Error(`Attribut d'événement interdit : ${key}`);
        if (URL_ATTRIBUTES.has(key) && !SAFE_URL.test(String(value))) throw new Error(`Adresse refusée : ${value}`);
        if (!isSvg && PROPERTIES.has(key)) element[key] = value;
        else element.setAttribute(key, value === true ? '' : String(value));
    }
  }
}

function appendChildren(element, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === true) continue;
    element.append(child instanceof Node ? child : String(child)); // une chaîne devient un nœud texte
  }
}

function normalize(props, children) {
  if (props == null || typeof props !== 'object' || props instanceof Node || Array.isArray(props)) {
    return [{}, [props, ...children]];
  }
  return [props, children];
}

/** h('p', { class: 'muted' }, 'Bonjour ', name) → <p class="muted">Bonjour …</p> */
export function h(tag, props, ...children) {
  const [attributes, content] = normalize(props, children);
  const element = document.createElement(tag);
  applyProps(element, attributes, false);
  appendChildren(element, content);
  return element;
}

export function svg(tag, props, ...children) {
  const [attributes, content] = normalize(props, children);
  const element = document.createElementNS(SVG_NS, tag);
  applyProps(element, attributes, true);
  appendChildren(element, content);
  return element;
}
