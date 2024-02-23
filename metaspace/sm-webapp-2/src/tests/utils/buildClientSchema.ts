import {
  IntrospectionEnumType,
  IntrospectionField,
  IntrospectionInputObjectType,
  IntrospectionInputValue,
  IntrospectionInterfaceType,
  IntrospectionObjectType,
  IntrospectionQuery,
  IntrospectionTypeRef,
  IntrospectionUnionType,
  // @ts-ignore
} from 'graphql'

export default (introspection: IntrospectionQuery): string => {
  let sdl = ''

  // Function to convert type references (e.g., scalars, lists, non-nulls)
  function convertTypeRef(typeRef: IntrospectionTypeRef): string {
    if (typeRef.kind === 'NON_NULL') {
      return `${convertTypeRef(typeRef.ofType as IntrospectionTypeRef)}!`
    } else if (typeRef.kind === 'LIST') {
      return `[${convertTypeRef(typeRef.ofType as IntrospectionTypeRef)}]`
    } else {
      return typeRef.name || ''
    }
  }

  // Function to convert field definitions
  function convertField(field: IntrospectionField): string {
    const args = field.args.map((arg) => `${arg.name}: ${convertTypeRef(arg.type)}`).join(', ')
    const type = convertTypeRef(field.type)
    return `${field.name}${args.length > 0 ? `(${args})` : ''}: ${type}`
  }

  // Function to convert object types (including query, mutation, subscription)
  function convertObjectType(type: IntrospectionObjectType): string {
    const fields = type.fields.map(convertField).join('\n  ')
    return `type ${type.name} {\n  ${fields}\n}`
  }

  // Convert enum types
  function convertEnumType(type: IntrospectionEnumType): string {
    const values = type.enumValues.map((value) => `  ${value.name}`).join('\n')
    return `enum ${type.name} {\n${values}\n}`
  }

  // Convert interface types
  function convertInterfaceType(type: IntrospectionInterfaceType): string {
    const fields = type.fields.map(convertField).join('\n  ')
    return `interface ${type.name} {\n  ${fields}\n}`
  }

  // Convert union types
  function convertUnionType(type: IntrospectionUnionType): string {
    const possibleTypes = type.possibleTypes.map((t) => t.name).join(' | ')
    return `union ${type.name} = ${possibleTypes}`
  }

  function convertInputValue(inputValue: IntrospectionInputValue): string {
    return `${inputValue.name}: ${convertTypeRef(inputValue.type)}`
  }

  // Convert input object types
  function convertInputObjectType(type: IntrospectionInputObjectType): string {
    const fields = type.inputFields.map(convertInputValue).join('\n  ')
    return `input ${type.name} {\n  ${fields}\n}`
  }

  // Convert scalar types
  function convertScalarType(type: { name: string }): string {
    return `scalar ${type.name}`
  }

  // Iterate over all types in the introspection result
  introspection.__schema.types.forEach((type) => {
    switch (type.kind) {
      case 'OBJECT':
        sdl += convertObjectType(type as IntrospectionObjectType) + '\n'
        break
      case 'ENUM':
        sdl += convertEnumType(type as IntrospectionEnumType) + '\n'
        break
      case 'INTERFACE':
        sdl += convertInterfaceType(type as IntrospectionInterfaceType) + '\n'
        break
      case 'UNION':
        sdl += convertUnionType(type as IntrospectionUnionType) + '\n'
        break
      case 'INPUT_OBJECT':
        sdl += convertInputObjectType(type as IntrospectionInputObjectType) + '\n'
        break
      case 'SCALAR':
        sdl += convertScalarType(type) + '\n'
        break
    }
  })
  // Add the main schema definition (query, mutation, subscription)
  sdl += 'schema {\n'
  if (introspection.__schema.queryType) {
    sdl += `  query: ${introspection.__schema.queryType.name}\n`
  }
  if (introspection.__schema.mutationType) {
    sdl += `  mutation: ${introspection.__schema.mutationType.name}\n`
  }
  if (introspection.__schema.subscriptionType) {
    sdl += `  subscription: ${introspection.__schema.subscriptionType.name}\n`
  }
  sdl += '}'

  return sdl
}
