let oldConsole: Partial<Console> | null = null

type ConsolePredicate = (...args: any[]) => boolean;
interface FilteredConsoleFunc {
  (...args: any[]): void;
  filters: ConsolePredicate[];
}

const wrapWithFilter = (origFunc: Function): FilteredConsoleFunc => {
  const wrappedFunc = function(this: any, ...args: any[]) {
    if (!wrappedFunc.filters.some(filter => filter(...args))) {
      origFunc.apply(this, args)
    }
  } as FilteredConsoleFunc
  wrappedFunc.filters = []
  return wrappedFunc
}

const suppressConsoleFn = (fn: keyof Console, filter?: ConsolePredicate | RegExp | string) => {
  if (oldConsole == null) {
    oldConsole = {}
  }
  if (oldConsole && !(fn in oldConsole)) {
    oldConsole[fn] = console[fn]
    console[fn] = wrapWithFilter(console[fn])
  }
  let predicate: ConsolePredicate
  if (filter == null) {
    predicate = () => true
  } else if (typeof filter === 'function') {
    predicate = filter
  } else if (filter instanceof RegExp) {
    predicate = (msg?: any) => filter.test(String(msg))
  } else {
    predicate = (msg?: any) => msg === filter
  }

  (console[fn] as FilteredConsoleFunc).filters.push(predicate)
}

export const suppressConsoleLog = (filter?: ConsolePredicate | RegExp | string) => suppressConsoleFn('log', filter)
export const suppressConsoleWarn = (filter?: ConsolePredicate | RegExp | string) => suppressConsoleFn('warn', filter)
export const suppressConsoleError = (filter?: ConsolePredicate | RegExp | string) => suppressConsoleFn('error', filter)

export const restoreConsole = () => {
  if (oldConsole != null) {
    let key: keyof Console
    for (key in oldConsole) {
      console[key] = oldConsole[key]
    }
    oldConsole = null
  }
}
