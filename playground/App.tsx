import { useState } from 'react'
import { Controls, defaultParams, type Params } from './Controls'
import { AmRadio, FmRadio } from './sections/AnalogRadio'
import { BerCurves } from './sections/BerCurves'
import { BitsToSymbols } from './sections/BitsToSymbols'
import { Carrier } from './sections/Carrier'
import { IQPlane } from './sections/IQPlane'
import { Keying } from './sections/Keying'
import { MessageThroughChannel } from './sections/MessageThroughChannel'
import { NoisyConstellation } from './sections/NoisyConstellation'
import { WifiRange } from './sections/WifiRange'

export function App() {
  const [params, setParams] = useState<Params>(defaultParams)
  const { scheme, snrDb } = params

  return (
    <div className="page">
      <header className="page-header">
        <h1>Wi-Fi and radio, visually</h1>
        <p>
          Every radio, from AM broadcast to Wi-Fi 7, does the same thing: it takes a plain sine wave and
          wiggles its amplitude, frequency or phase to carry information. Then noise gets in the way.
          Move the sliders and watch the bit errors appear.
        </p>
      </header>

      <div className="layout">
        <Controls params={params} onChange={setParams} />
        <main className="sections">
          <Carrier />
          <AmRadio snrDb={snrDb} />
          <FmRadio snrDb={snrDb} />
          <Keying snrDb={snrDb} />
          <IQPlane scheme={scheme} />
          <BitsToSymbols scheme={scheme} />
          <NoisyConstellation scheme={scheme} snrDb={snrDb} />
          <MessageThroughChannel scheme={scheme} snrDb={snrDb} />
          <BerCurves
            scheme={scheme}
            snrDb={snrDb}
            onPick={(patch) => setParams((p) => ({ ...p, ...patch }))}
          />
          <WifiRange onApply={(patch) => setParams((p) => ({ ...p, ...patch }))} />
        </main>
      </div>
    </div>
  )
}
