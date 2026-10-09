/**
 * Built-in assets, bundled with the app. Vite fingerprints each import, so
 * the URLs work from any deployment and cache safely. Files load only when a
 * creative actually uses them.
 *
 * What is (and is not) here is documented in docs/ASSET_CATALOGUE.md.
 */
import sisRoundel from "./library/logos/sisters-in-sweat-roundel-coral.png";
import nikeSwoosh from "./library/logos/nike-swoosh-black.png";

import padelHiveClub from "./library/photos/padel-hive-club.jpg";
import runCubbonParkStreet from "./library/photos/run-cubbon-park-street.jpg";
import basketballStJosephs from "./library/photos/basketball-st-josephs.jpg";
import basketballIndoorCourt from "./library/photos/basketball-indoor-court.jpg";
import basketballJakkur from "./library/photos/basketball-jakkur.jpg";
import runCubbonPark from "./library/photos/run-cubbon-park.jpg";
import footballJakkur from "./library/photos/football-jakkur.jpg";
import footballBullring from "./library/photos/football-bullring.jpg";
import footballSmGameDay from "./library/photos/football-sm-game-day-sufc.jpg";
import badmintonGameTheory from "./library/photos/badminton-game-theory.jpg";
import badmintonHsr from "./library/photos/badminton-hsr.jpg";
import yogaCubbonPark from "./library/photos/yoga-cubbon-park.jpg";
import pilatesKoramangala from "./library/photos/pilates-koramangala.jpg";
import functionalFitness from "./library/photos/functional-fitness-harrys.jpg";
import acroYoga from "./library/photos/acro-yoga-dhurii-domlur.jpg";
import cityBangalore from "./library/photos/city-bangalore.jpg";
import cityChennai from "./library/photos/city-chennai.jpg";

export interface BuiltinLogo {
  id: string;
  label: string;
  url: string;
  width: number;
  height: number;
  /** "sis" is on every creative and can never be removed or deleted. */
  role: "sis" | "partner";
  /** Overall tone, for legibility warnings on dark or light grounds. */
  tone: "dark" | "light" | "mixed";
}

export interface BuiltinPhoto {
  id: string;
  label: string;
  url: string;
  /** Small preview for the picker (320 px), so browsing doesn't load full photos. */
  thumbUrl: string;
  width: number;
  height: number;
  /** Starting focal point, 0–100. */
  focusX: number;
  focusY: number;
}

export const SIS_LOGO_ID = "sis";

export const BUILTIN_LOGOS: readonly BuiltinLogo[] = [
  { id: SIS_LOGO_ID, label: "Sisters in Sweat", url: sisRoundel, width: 803, height: 796, role: "sis", tone: "mixed" },
  { id: "nike", label: "Nike", url: nikeSwoosh, width: 370, height: 370, role: "partner", tone: "dark" },
];

export const BUILTIN_PARTNER_LOGOS = BUILTIN_LOGOS.filter((l) => l.role === "partner");

const THUMBS = import.meta.glob<string>("./library/photo-thumbs/*.jpg", { eager: true, query: "?url", import: "default" });

const photo = (id: string, label: string, url: string, width: number, height: number, focusX = 50, focusY = 50): BuiltinPhoto => ({
  id, label, url, thumbUrl: THUMBS[`./library/photo-thumbs/${id}.jpg`] ?? url, width, height, focusX, focusY,
});

/** The photo library the original tool offered, in its order. */
export const BUILTIN_PHOTOS: readonly BuiltinPhoto[] = [
  photo("run-cubbon-park-street", "Run — Cubbon Park street", runCubbonParkStreet, 720, 1280),
  photo("padel-hive-club", "Padel — Hive Club", padelHiveClub, 1066, 1600, 48, 42),
  photo("basketball-st-josephs", "Basketball — St. Joseph's", basketballStJosephs, 1600, 1000),
  photo("basketball-indoor-court", "Basketball — indoor court", basketballIndoorCourt, 1600, 1000),
  photo("basketball-jakkur", "Basketball — Jakkur", basketballJakkur, 1600, 1066),
  photo("run-cubbon-park", "Run — Cubbon Park", runCubbonPark, 1600, 1066),
  photo("football-jakkur", "Football — Jakkur", footballJakkur, 1600, 1000),
  photo("football-bullring", "Football — Bullring", footballBullring, 1600, 1000),
  photo("football-sm-game-day-sufc", "Football — S&M game day", footballSmGameDay, 1600, 1000),
  photo("badminton-game-theory", "Badminton — Game Theory", badmintonGameTheory, 1600, 1066),
  photo("badminton-hsr", "Badminton — HSR", badmintonHsr, 1600, 1066),
  photo("yoga-cubbon-park", "Yoga — Cubbon Park", yogaCubbonPark, 1600, 1066),
  photo("pilates-koramangala", "Pilates — Koramangala", pilatesKoramangala, 1600, 1066),
  photo("functional-fitness-harrys", "Functional fitness — Harry's", functionalFitness, 1600, 1000),
  photo("acro-yoga-dhurii-domlur", "Acro yoga — Dhurii, Domlur", acroYoga, 1600, 1066),
  photo("city-bangalore", "Bangalore — city", cityBangalore, 1600, 1066),
  photo("city-chennai", "Chennai — city", cityChennai, 1600, 1000),
];

export function findBuiltinLogo(id: string): BuiltinLogo | undefined {
  return BUILTIN_LOGOS.find((l) => l.id === id);
}

export function findBuiltinPhoto(id: string): BuiltinPhoto | undefined {
  return BUILTIN_PHOTOS.find((p) => p.id === id);
}
