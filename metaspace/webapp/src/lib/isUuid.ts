export default (str: string) => /[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}/i.test(str)
