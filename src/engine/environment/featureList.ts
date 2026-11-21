/** Liste der Umgebungs-Effekte (Reihenfolge = Reihenfolge der Hooks). VERTRAG: nur der Koordinator ändert diese Datei. */
import type { EnvironmentFeatureFactory } from './features';
import { createIblFeature } from './features/ibl';
import { createLooksFeature } from './features/looks';
import { createNatureFeature } from './features/nature';
import { createSeaFeature } from './features/sea';
import { createWeatherFeature } from './features/weather';

export const FEATURE_FACTORIES: EnvironmentFeatureFactory[] = [
  createIblFeature, // Paket 21: Reflexionssonde und Umgebungslicht
  createSeaFeature, // Paket 23: Meer unter der Insel
  createLooksFeature, // Paket 24: Stimmungsvorlagen, SSAO, Sonnenstrahlen
  createNatureFeature, // Paket 25: Gras, Bäume, Tageszyklus
  createWeatherFeature, // Paket 25: Wetter
];
