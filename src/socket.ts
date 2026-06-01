import { io } from 'socket.io-client'

const serverUrl = 'https://94.250.201.7.sslip.io'

export const socket = io(serverUrl)