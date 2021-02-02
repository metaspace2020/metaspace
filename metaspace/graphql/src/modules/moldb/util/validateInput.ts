import { validateTiptapJson } from '../../../utils/tiptap'
import { CreateMolecularDBInput, UpdateMolecularDBInput } from '../../../binding'

export default function validateInput(databaseDetails : CreateMolecularDBInput | UpdateMolecularDBInput) {
  if (databaseDetails.citation != null) {
    validateTiptapJson(databaseDetails.citation, 'citation')
  }
  if (databaseDetails.description != null) {
    validateTiptapJson(databaseDetails.description, 'description')
  }
}
