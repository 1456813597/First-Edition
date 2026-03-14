import styles from "./StatCard.module.css";

export function StatCard(props: { title: string; value: string; accent?: "rise" | "fall" | "neutral"; footnote?: string }) {
  return (
    <article className={styles.card} data-accent={props.accent ?? "neutral"}>
      <span>{props.title}</span>
      <strong>{props.value}</strong>
      {props.footnote ? <small>{props.footnote}</small> : null}
    </article>
  );
}

