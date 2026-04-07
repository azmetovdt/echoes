/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const TOKEN = import.meta.env.VITE_FREESOUND_TOKEN;

export interface FreesoundResult {
  id: number;
  name: string;
  previews: {
    'preview-hq-mp3': string;
    'preview-lq-mp3': string;
  };
  geotag: string;
  username: string;
  is_explicit?: boolean;
  duration?: number;
}

export async function fetchLocalSounds(lat: number, lon: number, radius: number = 10, includeExplicit: boolean = false, cc0Only: boolean = false): Promise<FreesoundResult[]> {
  if (!TOKEN) {
    console.warn('VITE_FREESOUND_TOKEN is not set. API calls will fail.');
    return [];
  }

  // Filter by geotag: "{!geofilt sfield=geotag pt=lat,lon d=radius_km}"
  let filter = `{!geofilt sfield=geotag pt=${lat},${lon} d=${radius}}`;
  
  if (cc0Only) {
    filter += ` license:"Creative Commons 0"`;
  }

  // Increase page_size to 40 to ensure we have enough results after client-side filtering
  const url = `https://freesound.org/apiv2/search/text/?filter=${encodeURIComponent(filter)}&fields=id,name,previews,geotag,username,is_explicit,duration&token=${TOKEN}&page_size=40`;
  console.log('Fetching from URL:', url);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Freesound API error details:', errorText);
      throw new Error(`Freesound API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    
    // Filter out explicit sounds if includeExplicit is false
    if (includeExplicit) {
      return data.results;
    }
    return data.results.filter((sound: FreesoundResult) => !sound.is_explicit);
  } catch (error) {
    console.error('Error fetching sounds:', error);
    return [];
  }
}
