import * as crypto from "crypto";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  TWITCH_OAUTH_CONFIG,
} from "./oauth";
import fetch from "node-fetch";
import { ClientCredentials } from "simple-oauth2";

enum EventsubType {
  ChannelFollow = "channel.follow",
  ChannelSubscribe = "channel.subscribe",
  ChannelSubscriptionEnd = "channel.subscription.end",
  ChannelBan = "channel.ban",
  ChannelUnban = "channel.unban",
  ChannelChannelPointsCustomRewardRedemptionAdd = "channel.channel_points_custom_reward_redemption.add",
  ChannelPollBegin = "channel.poll.begin",
  ChannelPollProgress = "channel.poll.progress",
  ChannelPollEnd = "channel.poll.end",
  ChannelPredictionBegin = "channel.prediction.begin",
  ChannelPredictionProgress = "channel.prediction.progress",
  ChannelPredictionEnd = "channel.prediction.end",
  ChannelHypeTrainBegin = "channel.hype_train.begin",
  ChannelHypeTrainProgress = "channel.hype_train.progress",
  ChannelHypeTrainEnd = "channel.hype_train.end",
}

export async function checkEventSubSubscriptions(userId: string) {
  const credentials = await new ClientCredentials(TWITCH_OAUTH_CONFIG).getToken(
    { scopes: [] }
  );
  const snapshot = await admin
    .database()
    .ref("userIds")
    .child("twitch")
    .orderByValue()
    .equalTo(userId)
    .get();
  const twitchUserId = Object.keys(snapshot.val() || {})[0];
  if (!twitchUserId) {
    console.log("missing twitch user id");
    return;
  }
  await Promise.all(
    Object.values(EventsubType).map(async (type) => {
      console.log("subscribing to", type, twitchUserId);
      const response = await fetch(
        "https://api.twitch.tv/helix/eventsub/subscriptions",
        {
          method: "POST",
          headers: {
            "Client-ID": TWITCH_CLIENT_ID,
            Authorization: `Bearer ${credentials.token.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type,
            version: "1",
            condition: { broadcaster_user_id: twitchUserId },
            transport: {
              method: "webhook",
              callback:
                "https://us-central1-rtchat-47692.cloudfunctions.net/eventsub",
              secret: TWITCH_CLIENT_SECRET,
            },
          }),
        }
      );
      console.log(await response.json());
    })
  );
}

export const eventsub = functions.https.onRequest(async (req, res) => {
  const hmacMessage =
    (req.headers["twitch-eventsub-message-id"] as string) +
    (req.headers["twitch-eventsub-message-timestamp"] as string) +
    req.rawBody.toString("utf-8");
  const signature = crypto
    .createHmac("sha256", "pszd4vpr7e3d22m6l7442za3vxzwvc")
    .update(hmacMessage)
    .digest("hex");
  if (
    String(req.headers["twitch-eventsub-message-signature"]) !==
    `sha256=${signature}`
  ) {
    console.error(new Error("failed to match signature"));
    res.status(403).send();
    return;
  } else {
    console.log("/eventsub", JSON.stringify(req.body));
  }

  const status = req.body?.subscription?.status;
  if (status === "webhook_callback_verification_pending") {
    res.status(200).send(req.body.challenge);
    return;
  } else if (status === "enabled") {
    const type = req.body?.subscription?.type as EventsubType;

    switch (type) {
      case EventsubType.ChannelBan:
      case EventsubType.ChannelChannelPointsCustomRewardRedemptionAdd:
    }
  }
  res.status(200).send();
});