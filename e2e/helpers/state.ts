/**
 * Shared state relay between serial test files.
 *
 * Team-track tests run in order and each file writes its
 * captured URLs/IDs to a JSON file that subsequent files read.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const STATE_DIR = join(import.meta.dirname, "..", ".state");
const STATE_FILE = join(STATE_DIR, "team-track.json");

export interface TeamTrackState {
  roleUrl: string;
  roleUrl2: string;
  candidateUrls: string[];
  applicationUrls: string[];
  interviewUrl: string;
  poolUrl: string;
  offerUrl: string;
  assessmentUrl: string;
}

const EMPTY: TeamTrackState = {
  roleUrl: "",
  roleUrl2: "",
  candidateUrls: [],
  applicationUrls: [],
  interviewUrl: "",
  poolUrl: "",
  offerUrl: "",
  assessmentUrl: "",
};

export function readState(): TeamTrackState {
  try {
    return { ...EMPTY, ...JSON.parse(readFileSync(STATE_FILE, "utf-8")) };
  } catch {
    return { ...EMPTY };
  }
}

export function writeState(patch: Partial<TeamTrackState>) {
  mkdirSync(STATE_DIR, { recursive: true });
  const current = readState();
  const merged = { ...current, ...patch };
  writeFileSync(STATE_FILE, JSON.stringify(merged, null, 2));
  return merged;
}
