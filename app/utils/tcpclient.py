import socket
import sys
import time

HOST, PORT = "localhost", 9999
data = " ".join(sys.argv[1:])


def client_socket(msg):
    # Create a socket (SOCK_STREAM means a TCP socket)
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

    try:
        # Connect to server and send data
        sock.connect((HOST, PORT))
        if msg == '':
            msg = 'hello python!'
        sock.sendall(msg + "\n")
        print "Sent:     {}".format(msg)

        # Receive data from the server and shut down
        received = sock.recv(1024)
        print "Received: {}".format(received)
    finally:
        sock.close()
    return


def multi_socket(num=10000):
    list_s = []
    for x in xrange(0, num):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.connect((HOST, PORT))
            list_s.append(s)
            time.sleep(0.01)
            print x
        except BaseException, e:
            print "exception: ", type(e), e
        time.sleep(0.5)
    return


client_socket('send from client socket.')
multi_socket(200)
