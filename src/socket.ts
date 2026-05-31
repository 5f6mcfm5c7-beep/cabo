import { io } from 'socket.io-client'

const serverUrl = `http://${window.location.hostname}:3001`

export const socket = io(serverUrl)