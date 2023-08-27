import { Object3DNode, T, extend } from '@solid-three/fiber'
import { For, createEffect, createMemo } from 'solid-js'
import { OculusHandModel } from './OculusHandModel'
import { useXR } from './XR'

declare global {
  namespace SolidThree {
    interface IntrinsicElements {
      OculusHandModel: Object3DNode<OculusHandModel>
    }
  }
}

export interface HandsProps {
  modelLeft?: string
  modelRight?: string
}
export function Hands({ modelLeft, modelRight }: HandsProps) {
  const controllers = useXR((state) => state.controllers)
  createMemo(() => extend({ OculusHandModel }), [])

  // Send fake connected event (no-op) so models start loading
  createEffect(() => {
    for (const target of controllers()) {
      target.hand.dispatchEvent({ type: 'connected', data: target.inputSource, fake: true })
    }
  })

  return (
    <For each={controllers()}>
      {({ hand }) => (
        <T.Portal container={hand}>
          <T.OculusHandModel args={[hand, modelLeft, modelRight]} />
        </T.Portal>
      )}
    </For>
  )
}
