import SocketServer
import threading
import time


class LbsTCPHandler(SocketServer.BaseRequestHandler):
    """
    The request handler class for our server.

    It is instantiated once per connection to the server, and must
    override the handle() method to implement communication to the
    client.
    """

    def handle(self):
        # self.request is the TCP socket connected to the client
        data = self.request.recv(1024).strip()
        print "{} wrote:".format(self.client_address[0])
        print data
        # just send back the same data, but upper-cased
        self.request.sendall(data.upper())


def worker(num):
    """
    thread worker function
    :return:
    """
    time.sleep(1)
    print("Thread %d" % num)

    host, port = "0.0.0.0", 9999  # localhost

    print "tcp server start! (ip=%s, port=%d)" % (host, port)
    # Create the server, binding to localhost on port 9999
    server = SocketServer.TCPServer((host, port), LbsTCPHandler)

    # Activate the server; this will keep running until you
    # interrupt the program with Ctrl-C
    server.serve_forever()
    return


t = threading.Thread(target=worker, args=(1,), name="t.%d" % 1)
# t.start()
