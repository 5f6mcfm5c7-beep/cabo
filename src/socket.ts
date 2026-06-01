import { io } from 'socket.io-client'

const serverUrl = 'http://94.250.201.7:3001'

export const socket = io(serverUrl)