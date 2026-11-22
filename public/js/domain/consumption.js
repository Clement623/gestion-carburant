/**
 * Calcul de la consommation par la méthode « de plein à plein ».
 *
 * Après un plein complet, le réservoir est plein. Au plein complet suivant, la quantité versée
 * (plus celle des pleins partiels faits entre les deux) correspond exactement au carburant
 * brûlé sur la distance parcourue depuis le premier plein :
 *
 *     consommation (L/100 km) = litres versés depuis le plein complet précédent ÷ km parcourus × 100
 *
 * Un plein partiel ne permet pas de conclure seul : ses litres sont reportés sur le plein complet suivant.
 * Les pleins faits avant le tout premier plein complet servent seulement de repère.
 *
 * Un « segment » relie deux pleins complets consécutifs. Toutes les statistiques en découlent.
 */

/** Trie les pleins dans l'ordre du compteur (puis de la date en cas d'égalité). */
export function sortFillups(fillups) {
  return [...fillups].sort((a, b) => a.odometer - b.odometer || a.date.localeCompare(b.date));
}

export function computeSegments(fillups) {
  const segments = [];
  let anchor = null; // dernier plein complet rencontré
  let liters = 0;
  let cost = 0;
  let count = 0;

  for (const fillup of sortFillups(fillups)) {
    if (anchor) {
      liters += fillup.liters;
      cost += fillup.totalCost;
      count += 1;
    }
    if (!fillup.isFull) continue;

    if (anchor) {
      const distance = fillup.odometer - anchor.odometer;
      if (distance > 0 && liters > 0) {
        segments.push(Object.freeze({
          fromId: anchor.id,
          toId: fillup.id,
          startDate: anchor.date,
          endDate: fillup.date,
          distance,
          liters,
          cost,
          fillupCount: count,
          l100: (liters / distance) * 100,
        }));
      }
    }
    anchor = fillup;
    liters = 0;
    cost = 0;
    count = 0;
  }
  return segments;
}

/**
 * Analyse complète d'une liste de pleins :
 * - `sorted`   : les pleins dans l'ordre du compteur ;
 * - `segments` : les segments de plein à plein ;
 * - `info`     : pour chaque plein, la distance depuis le plein précédent et le segment qu'il clôt.
 */
export function analyzeFillups(fillups) {
  const sorted = sortFillups(fillups);
  const segments = computeSegments(sorted);
  const segmentByEnd = new Map(segments.map((segment) => [segment.toId, segment]));
  const info = new Map();
  let previous = null;
  for (const fillup of sorted) {
    info.set(fillup.id, {
      distance: previous ? fillup.odometer - previous.odometer : null,
      segment: segmentByEnd.get(fillup.id) ?? null,
    });
    previous = fillup;
  }
  return { sorted, segments, info };
}

const DRAFT_ID = '__brouillon__';

/** Ce que donnerait un plein en cours de saisie s'il était enregistré (aperçu du formulaire). */
export function previewFillup(existing, draft) {
  const others = existing.filter((fillup) => fillup.id !== draft.id);
  const { info } = analyzeFillups([...others, { ...draft, id: DRAFT_ID }]);
  return info.get(DRAFT_ID);
}

/** Consommation moyenne sur tous les segments (null s'il n'y en a pas). */
export function averageConsumption(segments) {
  let liters = 0;
  let distance = 0;
  for (const segment of segments) {
    liters += segment.liters;
    distance += segment.distance;
  }
  return distance > 0 ? (liters / distance) * 100 : null;
}
