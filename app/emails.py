from flask import render_template
from flask_mail import Message
from app import mail
from decorators import async
from config import ADMINS, APP_NAME


@async
def send_async_email(msg):
    mail.send(msg)


def send_email(subject, sender, recipients, text_body, html_body):
    msg = Message(subject, sender=sender, recipients=recipients)
    msg.body = text_body
    msg.html = html_body
    send_async_email(msg)
    # thr = threading.Thread(target = send_async_email, args = [msg])
    # thr.start()


def follower_notification(followed, follower):
    send_email("[%s] %s is now following you!" % (APP_NAME, follower.nickname),
               ADMINS[0],
               [followed.email],
               render_template("follower_email.txt",
                               user=followed, follower=follower),
               render_template("follower_email.html",
                               user=followed, follower=follower))
