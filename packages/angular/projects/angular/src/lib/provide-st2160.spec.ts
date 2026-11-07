import { TestBed } from '@angular/core/testing';
import { provideSt2160, ST2160_CONFIG } from './provide-st2160';

describe('provideSt2160', () => {
  it('defaults to an empty config', () => {
    expect(TestBed.inject(ST2160_CONFIG)).toEqual({});
  });

  it('provides the given config', () => {
    TestBed.configureTestingModule({
      providers: [provideSt2160({ workerUrl: '/assets/st2160/worker.js' })],
    });
    expect(TestBed.inject(ST2160_CONFIG).workerUrl).toBe('/assets/st2160/worker.js');
  });
});
