import { type EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

/** App-wide st2160 settings (spec 01 section 5). More options arrive with M20. */
export interface St2160Config {
  /** Custom location of the core worker module, for apps that host it themselves. */
  readonly workerUrl?: string | URL;
}

export const ST2160_CONFIG = new InjectionToken<St2160Config>('ST2160_CONFIG', {
  providedIn: 'root',
  factory: () => ({}),
});

export function provideSt2160(config: St2160Config): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: ST2160_CONFIG, useValue: config }]);
}
