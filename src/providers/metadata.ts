import type { Asset } from '../core/model';
import type { LicenseMeta } from './types';
/** Use in the media import addAsset callback before the existing ADD_ASSET command. */
export function attachStockLicense(asset: Asset, meta: LicenseMeta): Asset {
  return {
    ...asset,
    metadata: {
      ...asset.metadata,
      stockLicense: { ...meta, license: { ...meta.license } },
    },
  };
}
