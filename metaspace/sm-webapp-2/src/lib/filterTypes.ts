export interface SingleSelectFilterType {
  value: any;
  label: string;
  isGroup?: boolean;
  id?: any;
}

export const datasetOwnerOptions : SingleSelectFilterType[] = [
  { value: "", label: 'All datasets' },
  { value: 'my-datasets', label: 'My datasets' },
]
