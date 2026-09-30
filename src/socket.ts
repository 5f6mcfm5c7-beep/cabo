import { io } from 'socket.io-client'

const serverUrl = import.meta.env.DEV
? `http://${window.location.hostname}:3001`
  : 'https://94.250.201.7.sslip.io'

export const socket = io(serverUrl)