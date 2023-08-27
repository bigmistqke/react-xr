import { T, useThree } from '@solid-three/fiber'
import { Accessor, For, createEffect, createMemo, createSignal, onCleanup, useContext, type JSX } from 'solid-js'
import { SetStoreFunction, createStore } from 'solid-js/store'
import * as THREE from 'three'
import { InteractionManager, XRInteractionHandler, XRInteractionType } from './Interactions'
import { XRController } from './XRController'
import { XREventHandler } from './XREvents'
import { XRContext, XRState } from './context'
import { defaultProps } from './helpers/defaultProps'
import { processProps } from './helpers/processProps'
import { RefComponent } from './helpers/typeHelpers'
import { uniq } from './utils'

interface GlobalSessionState {
  set: SetStoreFunction<GlobalSessionState>
  get: Accessor<GlobalSessionState>
  session: XRSession | null
  referenceSpaceType: XRReferenceSpaceType | null
}

//@ts-expect-error
const set: SetStoreFunction<RootState> = (...args: any[]) => setGlobalSessionStore(...args)
const get: Accessor<GlobalSessionState> = () => globalSessionStore
const [globalSessionStore, setGlobalSessionStore] = createStore({
  get,
  set,
  session: null,
  referenceSpaceType: null
} as GlobalSessionState)

export type XRManagerEventType = 'sessionstart' | 'sessionend'
export interface XRManagerEvent {
  type: XRManagerEventType
  target: XRSession | null
}
export interface XRProps {
  /**
   * Enables foveated rendering. `Default is `0`
   * 0 = no foveation, full resolution
   * 1 = maximum foveation, the edges render at lower resolution
   */
  foveation?: number
  /**
   * The target framerate for the XRSystem. Smaller rates give more CPU headroom at the cost of responsiveness.
   * Recommended range is `72`-`120`. Default is unset and left to the device.
   * @note If your experience cannot effectively reach the target framerate, it will be subject to frame reprojection
   * which will halve the effective framerate. Choose a conservative estimate that balances responsiveness and
   * headroom based on your experience.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Rendering#refresh_rate_and_frame_rate
   */
  frameRate?: number
  /** Type of WebXR reference space to use. Default is `local-floor` */
  referenceSpace?: XRReferenceSpaceType
  /** Called as an XRSession is requested */
  onSessionStart?: XREventHandler<XRManagerEvent>
  /** Called after an XRSession is terminated */
  onSessionEnd?: XREventHandler<XRManagerEvent>
  /** Called when an XRSession is hidden or unfocused. */
  onVisibilityChange?: XREventHandler<XRSessionEvent>
  /** Called when available inputsources change */
  onInputSourcesChange?: XREventHandler<XRSessionEvent>
  children: JSX.Element
}
function XRManager(_props: XRProps) {
  const props = defaultProps(_props, {
    foveation: 0,
    referenceSpace: 'local-floor'
  })
  const threeState = useThree()
  const xrState = useXR()

  createEffect(() => {
    ;[0, 1].map((id) => {
      const target = new XRController(id, threeState.gl)
      const onConnected = () => xrState.set((state) => ({ controllers: [...state.controllers, target] }))
      const onDisconnected = () => xrState.set((state) => ({ controllers: state.controllers.filter((it) => it !== target) }))

      target.addEventListener('connected', onConnected)
      target.addEventListener('disconnected', onDisconnected)

      onCleanup(() => {
        target.removeEventListener('connected', onConnected)
        target.removeEventListener('disconnected', onDisconnected)
      })
    })
  })

  createEffect(() => {
    // s3f why not immediately bind xrState to globalSessionStore.session?
    xrState.set({
      get session() {
        return globalSessionStore.session
      }
    })
  })

  createEffect(() => {
    threeState.gl.xr.setFoveation(props.foveation)
    xrState.set({ foveation: props.foveation })
  })

  createEffect(() => {
    try {
      if (props.frameRate) xrState.session?.updateTargetFrameRate?.(props.frameRate)
    } catch (_) {
      // Framerate not supported or configurable
    }
    xrState.set({ frameRate: props.frameRate })
  })

  createEffect(() => {
    threeState.gl.xr.setReferenceSpaceType(props.referenceSpace)
    xrState.set({ referenceSpace: props.referenceSpace })
    globalSessionStore.set({ referenceSpaceType: props.referenceSpace })
  })

  createEffect(() => {
    if (!xrState.session) return void threeState.gl.xr.setSession(null!)

    const handleSessionStart = (nativeEvent: XRManagerEvent) => {
      xrState.set({ isPresenting: true })
      props.onSessionStart?.({ nativeEvent: { ...nativeEvent, target: xrState.session }, target: xrState.session })
    }
    const handleSessionEnd = (nativeEvent: XRManagerEvent) => {
      xrState.set({ isPresenting: false, session: null })
      globalSessionStore.set({ session: null })
      props.onSessionEnd?.({ nativeEvent: { ...nativeEvent, target: xrState.session }, target: xrState.session })
    }
    const handleVisibilityChange = (nativeEvent: XRSessionEvent) => {
      props.onVisibilityChange?.({ nativeEvent, target: xrState.session })
    }
    const handleInputSourcesChange = (nativeEvent: XRInputSourceChangeEvent) => {
      if (!xrState.session) return
      const isHandTracking = Object.values(xrState.session.inputSources).some((source) => source.hand)
      xrState.set({ isHandTracking })
      props.onInputSourcesChange?.({ nativeEvent, target: xrState.session })
    }

    threeState.gl.xr.addEventListener('sessionstart', handleSessionStart)
    threeState.gl.xr.addEventListener('sessionend', handleSessionEnd)
    xrState.session.addEventListener('visibilitychange', handleVisibilityChange)
    xrState.session.addEventListener('inputsourceschange', handleInputSourcesChange)

    threeState.gl.xr.setSession(xrState.session).then(() => {
      // on setSession, three#WebXRManager resets foveation to 1
      // so foveation set needs to happen after it
      threeState.gl.xr.setFoveation(xrState.foveation)
    })

    onCleanup(() => {
      threeState.gl.xr.removeEventListener('sessionstart', handleSessionStart)
      threeState.gl.xr.removeEventListener('sessionend', handleSessionEnd)
      xrState.session?.removeEventListener('visibilitychange', handleVisibilityChange)
      xrState.session?.removeEventListener('inputsourceschange', handleInputSourcesChange)
    })
  })

  return (
    <InteractionManager>
      <T.Primitive object={xrState.player}>
        <T.Primitive object={threeState.camera} />
        <For each={xrState.controllers}>{(controller) => <T.Primitive object={controller} />}</For>
      </T.Primitive>
      {props.children}
    </InteractionManager>
  )
}

export function XR(props: XRProps) {
  // @ts-expect-error
  const set: SetStoreFunction<XRState> = (...args: any[]) => setStore(...args)
  const get: Accessor<XRState> = () => store
  const [store, setStore] = createStore<XRState>({
    set,
    get,

    controllers: [],
    isPresenting: false,
    isHandTracking: false,
    player: new THREE.Group(),
    session: null,
    foveation: 0,
    referenceSpace: 'local-floor',

    hoverState: {
      left: new Map(),
      right: new Map(),
      none: new Map()
    },
    interactions: new Map(),
    hasInteraction(object: THREE.Object3D, eventType: XRInteractionType) {
      return !!get()
        .interactions.get(object)
        ?.[eventType].some((handlerRef) => handlerRef)
    },
    getInteraction(object: THREE.Object3D, eventType: XRInteractionType) {
      return get()
        .interactions.get(object)
        ?.[eventType].reduce((result, handlerRef) => {
          if (handlerRef) {
            result.push(handlerRef)
          }
          return result
        }, [] as XRInteractionHandler[])
    },
    addInteraction(object: THREE.Object3D, eventType: XRInteractionType, handlerRef: React.RefObject<XRInteractionHandler>) {
      const interactions = get().interactions
      if (!interactions.has(object)) {
        interactions.set(object, {
          onHover: [],
          onBlur: [],
          onSelect: [],
          onSelectEnd: [],
          onSelectStart: [],
          onSelectMissed: [],
          onSqueeze: [],
          onSqueezeEnd: [],
          onSqueezeStart: [],
          onSqueezeMissed: [],
          onMove: []
        })
      }

      const target = interactions.get(object)!
      target[eventType].push(handlerRef)
    },
    removeInteraction(object: THREE.Object3D, eventType: XRInteractionType, handlerRef: React.RefObject<XRInteractionHandler>) {
      const target = get().interactions.get(object)
      if (target) {
        const interactionIndex = target[eventType].indexOf(handlerRef)
        if (interactionIndex !== -1) target[eventType].splice(interactionIndex, 1)
      }
    }
  })

  return (
    <XRContext.Provider value={store}>
      <XRManager {...props} />
    </XRContext.Provider>
  )
}

export type XRButtonStatus = 'unsupported' | 'exited' | 'entered'
export type XRButtonUnsupportedReason = 'unknown' | 'https' | 'security'
export interface XRButtonProps extends Omit<JSX.IntrinsicElements['button'], 'children' | 'onError'> {
  /** The type of `XRSession` to create */
  mode: 'AR' | 'VR' | 'inline'
  /**
   * `XRSession` configuration options
   * @see https://immersive-web.github.io/webxr/#feature-dependencies
   */
  sessionInit?: XRSessionInit
  /** Whether this button should only enter an `XRSession`. Default is `false` */
  enterOnly?: boolean
  /** Whether this button should only exit an `XRSession`. Default is `false` */
  exitOnly?: boolean
  /** This callback gets fired if XR initialization fails. */
  onError?: (error: Error) => void
  /** React children, can also accept a callback returning an `XRButtonStatus` */
  children?: JSX.Element | ((status: XRButtonStatus) => JSX.Element)
}

const getSessionOptions = (
  globalStateReferenceSpaceType: XRReferenceSpaceType | null,
  sessionInit: XRSessionInit | undefined
): XRSessionInit | undefined => {
  if (!globalStateReferenceSpaceType && !sessionInit) {
    return undefined
  }

  if (globalStateReferenceSpaceType && !sessionInit) {
    return { optionalFeatures: [globalStateReferenceSpaceType] }
  }

  if (globalStateReferenceSpaceType && sessionInit) {
    return { ...sessionInit, optionalFeatures: uniq([...(sessionInit.optionalFeatures ?? []), globalStateReferenceSpaceType]) }
  }

  return sessionInit
}

export const startSession = async (sessionMode: XRSessionMode, sessionInit: XRButtonProps['sessionInit']) => {
  const xrState = globalSessionStore.get()

  if (xrState.session) {
    console.warn('@react-three/xr: session already started, please stop it first')
    return
  }

  const options = getSessionOptions(xrState.referenceSpaceType, sessionInit)
  const session = await navigator.xr!.requestSession(sessionMode, options)
  xrState.set({ session })
  return session
}

export const stopSession = async () => {
  const xrState = globalSessionStore.get()

  if (!xrState.session) {
    console.warn('@react-three/xr: no session to stop, please start it first')
    return
  }

  await xrState.session.end()
  xrState.set({ session: null })
}

export const toggleSession = async (
  sessionMode: XRSessionMode,
  { sessionInit, enterOnly, exitOnly }: Pick<XRButtonProps, 'sessionInit' | 'enterOnly' | 'exitOnly'> = {}
) => {
  const xrState = globalSessionStore.get()

  // Bail if certain toggle way is disabled
  if (xrState.session && enterOnly) return
  if (!xrState.session && exitOnly) return

  // Exit/enter session
  if (xrState.session) {
    return await stopSession()
  } else {
    return await startSession(sessionMode, sessionInit)
  }
}

const getLabel = (status: XRButtonStatus, mode: XRButtonProps['mode'], reason: XRButtonUnsupportedReason) => {
  switch (status) {
    case 'entered':
      return `Exit ${mode}`
    case 'exited':
      return `Enter ${mode}`
    case 'unsupported':
    default:
      switch (reason) {
        case 'https':
          return 'HTTPS needed'
        case 'security':
          return `${mode} blocked`
        case 'unknown':
        default:
          return `${mode} unsupported`
      }
  }
}

export const XRButton: RefComponent<HTMLButtonElement, XRButtonProps> = function XRButton(_props) {
  const [props, rest] = processProps(_props, { enterOnly: false, exitOnly: false }, [
    'ref',
    'mode',
    'sessionInit',
    'enterOnly',
    'exitOnly',
    'onClick',
    'onError',
    'children'
  ])

  const [status, setStatus] = createSignal<XRButtonStatus>('exited')
  const [reason, setReason] = createSignal<XRButtonUnsupportedReason>('unknown')
  const label = () => getLabel(status(), props.mode, reason())
  const sessionMode = () => (props.mode === 'inline' ? props.mode : `immersive-${props.mode.toLowerCase()}`) as XRSessionMode

  createEffect(() => {
    if (!navigator?.xr) return void setStatus('unsupported')
    navigator.xr
      .isSessionSupported(sessionMode())
      .then((supported) => {
        if (!supported) {
          const isHttps = location.protocol === 'https:'
          setStatus('unsupported')
          setReason(isHttps ? 'unknown' : 'https')
        } else {
          setStatus('exited')
        }
      })
      .catch((error) => {
        setStatus('unsupported')
        // https://developer.mozilla.org/en-US/docs/Web/API/XRSystem/isSessionSupported#exceptions
        if ('name' in error && error.name === 'SecurityError') {
          setReason('security')
        } else {
          setReason('unknown')
        }
      })
  })

  createEffect(() => {
    if (globalSessionStore.session) {
      setStatus('entered')
    } else if (globalSessionStore.session !== 'unsupported') {
      setStatus('exited')
    }
  })

  const handleButtonClick = async (event: MouseEvent) => {
    // s3f look into type-error
    props.onClick?.(event)

    try {
      toggleSession(sessionMode(), { sessionInit: props.sessionInit, enterOnly: props.enterOnly, exitOnly: props.exitOnly })
    } catch (e) {
      if (props.onError && e instanceof Error) props.onError(e)
      else throw e
    }
  }

  return (
    <button {...rest} ref={props.ref} onClick={status() === 'unsupported' ? props.onClick : handleButtonClick}>
      {typeof props.children === 'function' ? props.children(status()) : props.children ?? label()}
    </button>
  )
}

const buttonStyles: any = {
  position: 'absolute',
  bottom: '24px',
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '12px 24px',
  border: '1px solid white',
  borderRadius: '4px',
  background: 'rgba(0, 0, 0, 0.1)',
  color: 'white',
  font: 'normal 0.8125rem sans-serif',
  outline: 'none',
  zIndex: 99999,
  cursor: 'pointer'
}

export const ARButton: RefComponent<HTMLButtonElement, Omit<XRButtonProps, 'mode'>> = (_props) => {
  const [props, rest] = processProps(
    _props,
    {
      style: buttonStyles,
      sessionInit: {
        // @ts-ignore
        domOverlay: typeof document !== 'undefined' ? { root: document.body } : undefined,
        optionalFeatures: ['hit-test', 'dom-overlay', 'dom-overlay-for-handheld-ar']
      }
    },
    ['ref', 'style', 'sessionInit', 'children']
  )
  return (
    <XRButton {...rest} ref={props.ref} mode="AR" style={props.style} sessionInit={props.sessionInit}>
      {props.children}
    </XRButton>
  )
}

export const VRButton: RefComponent<HTMLButtonElement, Omit<XRButtonProps, 'mode'>> = (_props) => {
  const [props, rest] = processProps(
    _props,
    {
      style: buttonStyles,
      sessionInit: { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'] }
    },
    ['ref', 'style', 'sessionInit', 'children']
  )
  return (
    <XRButton {...rest} ref={props.ref} mode="VR" style={props.style} sessionInit={props.sessionInit}>
      {props.children}
    </XRButton>
  )
}

// s3f  removed equalityFn because is gonna be deprecated anyway: https://github.com/pmndrs/zustand/discussions/1937
//      follows same overloads as `useThree`:
//        - you specify a selector and get an accessor
//        - you don't specify a selector and get the store directly.
export function useXR(): XRState
export function useXR<T = XRState>(selector: (state: XRState) => T): Accessor<T>
export function useXR<T = XRState>(selector?: (state: XRState) => T) {
  const store = useContext(XRContext)
  if (!store) throw new Error('useXR must be used within an <XR /> component!')
  if (selector) return () => selector(store)
  return store
}

export function useController(handedness: XRHandedness) {
  const controllers = useXR((state) => state.controllers)
  const controller = createMemo(() =>
    controllers().find(({ inputSource }) => inputSource?.handedness && inputSource.handedness === handedness)
  )
  return controller
}
