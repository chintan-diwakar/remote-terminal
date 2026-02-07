import chalk from 'chalk';

export function createLogger(component) {
  const prefix = chalk.gray(`[${component}]`);
  return {
    info: (...args) => console.log(prefix, ...args),
    warn: (...args) => console.warn(prefix, chalk.yellow(...args)),
    error: (...args) => console.error(prefix, chalk.red(...args)),
    success: (...args) => console.log(prefix, chalk.green(...args)),
  };
}
