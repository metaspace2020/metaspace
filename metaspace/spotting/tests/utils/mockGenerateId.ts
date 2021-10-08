const module = require('element-ui/lib/utils/util')

const originalImpl = module.generateId

// jest.spyOn did not work
const mock = jest.fn(originalImpl)
module.generateId = mock

export const mockGenerateId = (id: number) => mock.mockReturnValue(id)
export const resetGenerateId = () => mock.mockImplementation(originalImpl)
