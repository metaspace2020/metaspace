import { AnalyzerSource, FieldResolversFor } from '../../../bindingTypes'
import { Analyzer } from '../../../binding'

const AnalyzerResolvers: FieldResolversFor<Analyzer, AnalyzerSource> = {
  resolvingPower({ rp, type }, { mz }: { mz: number }) {
    if (type.toUpperCase() === 'ORBITRAP') {
      return Math.sqrt(rp.mz / mz) * rp.Resolving_Power
    } else if (type.toUpperCase() === 'FTICR') {
      return (rp.mz / mz) * rp.Resolving_Power
    } else {
      return rp.Resolving_Power
    }
  },
}

export default AnalyzerResolvers
