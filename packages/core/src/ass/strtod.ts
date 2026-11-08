// Ported from libass/ass_strtod.c (Tcl strtod, Regents of UC / Sun / Oleg Oshmyan).
const MAX_EXPONENT = 511;
const DBL_MAX_10_EXP = 308;
const DBL_MIN_10_EXP = -307;

const POWERS_OF_10 = [10.0, 100.0, 1.0e4, 1.0e8, 1.0e16, 1.0e32, 1.0e64, 1.0e128, 1.0e256];

const NEG_POW_OF_10 = [0.1, 0.01, 1.0e-4, 1.0e-8, 1.0e-16, 1.0e-32, 1.0e-64, 1.0e-128, 1.0e-256];

export function isAssSpace(code: number): boolean {
  return (
    code === 0x20 ||
    code === 0x09 ||
    code === 0x0a ||
    code === 0x0b ||
    code === 0x0c ||
    code === 0x0d
  );
}

export function isAssDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

export interface AssStrtodResult {
  readonly value: number;
  readonly nextPos: number;
}

export function assStrtod(str: string, startPos = 0): AssStrtodResult {
  const len = str.length;
  let p = startPos;
  while (p < len && isAssSpace(str.charCodeAt(p))) {
    p += 1;
  }

  let sign = false;
  if (p < len && str.charCodeAt(p) === 0x2d) {
    sign = true;
    p += 1;
  } else if (p < len && str.charCodeAt(p) === 0x2b) {
    p += 1;
  }

  let decPt = -1;
  let leadZeros = -1;
  let mantSize = 0;
  for (; ; mantSize += 1) {
    const c = p < len ? str.charCodeAt(p) : -1;
    if (!isAssDigit(c)) {
      if (c !== 0x2e || decPt !== -1) {
        break;
      }
      decPt = mantSize;
    } else if (c !== 0x30 && leadZeros === -1) {
      leadZeros = mantSize;
    }
    p += 1;
  }

  if (leadZeros === -1) {
    leadZeros = mantSize;
  }
  const pExp = p;
  p -= mantSize - leadZeros;
  if (decPt === -1) {
    decPt = mantSize;
  } else {
    mantSize -= 1;
    if (decPt < leadZeros) {
      leadZeros -= 1;
    }
  }
  if (mantSize - leadZeros > 18) {
    mantSize = leadZeros + 18;
  }

  let fracExpSign: boolean;
  let fracExp: number;
  if (decPt < mantSize) {
    fracExpSign = true;
    fracExp = mantSize - decPt;
  } else {
    fracExpSign = false;
    fracExp = decPt - mantSize;
  }

  if (mantSize === 0) {
    return { value: sign ? -0.0 : 0.0, nextPos: startPos };
  }

  mantSize -= leadZeros;
  let m = mantSize;
  let frac1 = 0;
  for (; m > 9; m -= 1) {
    let c = str.charCodeAt(p);
    p += 1;
    if (c === 0x2e) {
      c = str.charCodeAt(p);
      p += 1;
    }
    frac1 = 10 * frac1 + (c - 0x30);
  }
  let frac2 = 0;
  for (; m > 0; m -= 1) {
    let c = str.charCodeAt(p);
    p += 1;
    if (c === 0x2e) {
      c = str.charCodeAt(p);
      p += 1;
    }
    frac2 = 10 * frac2 + (c - 0x30);
  }
  let fraction = 1.0e9 * frac1 + frac2;

  p = pExp;
  let exp = 0;
  let expSign = false;
  let expOverflowed = false;
  const expChar = p < len ? str.charCodeAt(p) : -1;
  if (expChar === 0x45 || expChar === 0x65) {
    p += 1;
    if (p < len && str.charCodeAt(p) === 0x2d) {
      expSign = true;
      p += 1;
    } else {
      if (p < len && str.charCodeAt(p) === 0x2b) {
        p += 1;
      }
      expSign = false;
    }

    let expLimit: number;
    if (expSign === fracExpSign) {
      if (MAX_EXPONENT < fracExp) {
        expLimit = 0;
      } else {
        expLimit = Math.trunc((MAX_EXPONENT - fracExp) / 10);
      }
    } else {
      expLimit = Math.trunc(fracExp / 10) + Math.trunc(((fracExp % 10) + MAX_EXPONENT) / 10);
    }

    while (p < len && isAssDigit(str.charCodeAt(p))) {
      if (exp > expLimit) {
        while (p < len && isAssDigit(str.charCodeAt(p))) {
          p += 1;
        }
        expOverflowed = true;
        break;
      }
      exp = exp * 10 + (str.charCodeAt(p) - 0x30);
      p += 1;
    }

    if (!expOverflowed) {
      if (expSign === fracExpSign) {
        exp = fracExp + exp;
      } else if (fracExp <= exp) {
        exp = exp - fracExp;
      } else {
        exp = fracExp - exp;
        expSign = fracExpSign;
      }
    }
  } else {
    exp = fracExp;
    expSign = fracExpSign;
  }

  if (expOverflowed || exp > MAX_EXPONENT) {
    exp = MAX_EXPONENT;
  }

  let table = POWERS_OF_10;
  if (exp > DBL_MAX_10_EXP && expSign) {
    if (exp > -DBL_MIN_10_EXP) {
      exp -= mantSize;
      let dblExp = 1.0;
      for (let idx = 0; mantSize !== 0; mantSize >>= 1, idx += 1) {
        if ((mantSize & 1) !== 0) {
          dblExp *= POWERS_OF_10[idx] as number;
        }
      }
      fraction /= dblExp;
    }
    table = NEG_POW_OF_10;
    expSign = false;
  }

  let dblExp = 1.0;
  for (let idx = 0; exp !== 0; exp >>= 1, idx += 1) {
    if ((exp & 1) !== 0) {
      dblExp *= table[idx] as number;
    }
  }

  if (expSign) {
    fraction /= dblExp;
  } else {
    fraction *= dblExp;
  }

  return { value: sign ? -fraction : fraction, nextPos: p };
}

export function assAtof(str: string, startPos = 0): number {
  return assStrtod(str, startPos).value;
}
