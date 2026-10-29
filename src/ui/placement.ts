// FIX7: where the owner lists a catalog item, for the items that come from an
// AI-made Creator Pack (styles, motion, presets, plans, effects …). Items
// imported by the user themselves always belong to the AI category.
import { libraryClient } from '../library-client';
import {
  defaultPlace,
  placesOf,
  type Place,
} from '../library-client/taxonomy';
import type { CreatorEntry } from './creator-library';

const KIND: Record<string, string> = { transition: 'xtransition' };

export function creatorPlaces(entry: CreatorEntry): Place[] {
  if (entry.packId !== 'catalog')
    return [{ category: 'AI', sub: null, section: null }];
  const id = entry.key.slice('catalog/'.length);
  const found = libraryClient().entry(id);
  const kind = KIND[entry.item.type] ?? entry.item.type;
  return placesOf(kind, undefined, found?.place, found?.alsoIn).length
    ? placesOf(kind, undefined, found?.place, found?.alsoIn)
    : [defaultPlace(kind, undefined)];
}
