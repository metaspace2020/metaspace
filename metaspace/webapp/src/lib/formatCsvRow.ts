export default (values: string[]): string => {
  const escaped = values.map(v => {
    if (v != null) {
      return `"${String(v).replace(/"/g, '""')}"`;
    } else {
      return '';
    }
  });

  return escaped.join(',') + '\n';
};
